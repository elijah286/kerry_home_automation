// ---------------------------------------------------------------------------
// Ubuntu autoinstall user-data YAML generator
// Pure function — no I/O, no side effects
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';

export interface AutoinstallConfig {
  hostname: string;
  username: string;
  hashedPassword: string;   // SHA-512 crypt hash (see hashPasswordForAutoinstall)
  sshAuthorizedKey?: string;
  appRepoUrl: string;
  envFileBase64: string;    // base64 of the full .env file content
  appDir: string;           // e.g. /opt/home-automation
}

/**
 * Hash a plaintext password into SHA-512 crypt format required by Ubuntu autoinstall.
 * Calls `openssl passwd -6` — requires openssl in $PATH (standard on macOS & Linux).
 */
export function hashPasswordForAutoinstall(plaintext: string): string {
  const result = execFileSync('openssl', ['passwd', '-6', plaintext], {
    encoding: 'utf8',
  });
  return result.trim();
}

/**
 * Generate the Ubuntu 24.04 autoinstall user-data YAML string.
 *
 * This config uses the "nocloud" data source so it can be placed directly
 * on the ISO filesystem at /user-data (alongside an empty /meta-data).
 * The boot/grub/grub.cfg must be patched to append:
 *   autoinstall ds=nocloud;s=/cdrom/
 */
export function generateAutoinstallYaml(cfg: AutoinstallConfig): string {
  const sshKeyLine = cfg.sshAuthorizedKey
    ? `\n      - "${cfg.sshAuthorizedKey.trim()}"`
    : '';

  // Must match scripts/update.sh and server system routes: full stack + sidecars (e.g. roborock-bridge)
  // live in docker-compose.prod.yml, not the dev-only docker-compose.yml.
  // ExecStartPre=+scripts/host-prereqs.sh runs as root every boot and handles
  // Intel iGPU driver install, RENDER_GID/VIDEO_GID detection → .env, and
  // /dev/dri sanity checks. Keeps the system zero-touch across hardware moves.
  const serviceUnit = [
    '[Unit]',
    'Description=Home Automation',
    'After=network-online.target docker.service',
    'Wants=network-online.target',
    'Requires=docker.service',
    '',
    '[Service]',
    `WorkingDirectory=${cfg.appDir}`,
    `ExecStartPre=+${cfg.appDir}/scripts/host-prereqs.sh`,
    'ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up --build',
    'ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down',
    'Restart=on-failure',
    'RestartSec=10',
    `User=${cfg.username}`,
    '',
    '[Install]',
    'WantedBy=multi-user.target',
  ].join('\\n');

  return `#cloud-config
autoinstall:
  version: 1
  locale: en_US.UTF-8
  keyboard:
    layout: us
  network:
    network:
      version: 2
      ethernets:
        any:
          match:
            name: "en*"
          dhcp4: true
  storage:
    layout:
      name: lvm
  identity:
    hostname: ${cfg.hostname}
    username: ${cfg.username}
    password: "${cfg.hashedPassword}"
  ssh:
    install-server: true
    authorized-keys:${sshKeyLine || ' []'}
    allow-pw: true
  packages:
    - docker.io
    - docker-compose-plugin
    - git
    - curl
    - openssh-server
    # Intel iGPU hardware video acceleration — enables VAAPI in the go2rtc
    # container so camera HLS/MJPEG transcoding uses the iGPU instead of
    # pegging the CPU. Safe on AMD/other hardware — packages install
    # cleanly, just go unused.
    - intel-media-va-driver-non-free
    - intel-gpu-tools
    - vainfo
  user-data:
    disable_root: false
  late-commands:
    # Clone app repo
    - "curtin in-target --target=/target -- git clone --depth=1 ${cfg.appRepoUrl} ${cfg.appDir}"
    # Write .env from base64 (avoids all shell-quoting issues with special chars)
    - "echo '${cfg.envFileBase64}' | base64 -d > /target${cfg.appDir}/.env"
    # Set ownership
    - "curtin in-target --target=/target -- chown -R ${cfg.username}:${cfg.username} ${cfg.appDir}"
    # Install systemd service unit
    - |
      printf '%b' '${serviceUnit}' > /target/etc/systemd/system/home-automation.service
    # Enable service and add user to docker group
    - "curtin in-target --target=/target -- systemctl enable home-automation.service"
    - "curtin in-target --target=/target -- usermod -aG docker ${cfg.username}"
    - "curtin in-target --target=/target -- systemctl daemon-reload"
    # Create log directory
    - "mkdir -p /target/var/log/home-automation"
    - "chown ${cfg.username}:${cfg.username} /target/var/log/home-automation"
    # Make update script executable
    - "chmod +x /target${cfg.appDir}/scripts/update.sh"
    # Allow admin user to reboot without password (needed for update script Layer 4)
    - |
      printf '%s\n' '${cfg.username} ALL=(ALL) NOPASSWD: /sbin/reboot' > /target/etc/sudoers.d/home-automation
    - "chmod 440 /target/etc/sudoers.d/home-automation"
  shutdown: reboot
`;
}
