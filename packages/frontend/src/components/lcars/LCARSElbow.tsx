'use client';

/**
 * LCARS Elbow — the signature L-shaped bracket.
 *
 * **Top** inner corner: **additive** quarter circle — center in the black void SE of the
 * joint so chrome bulges into that space (classic LCARS header join).
 *
 * **Bottom** inner corner: **same additive geometry as the top**, mirrored — center
 * `(barW+fr, or−fr)` (void NE of the joint); arc runs from `(barW, or−fr)` on the stem to
 * `(barW+fr, or)` on the footer so chrome swoops down and right to meet the sidebar.
 *
 * barWidth = full width of the sidebar/vertical bar (the wide left part)
 */

const DEFAULT_ADDITIVE_FILLET = 14;

interface ElbowProps {
  position: 'top-left' | 'bottom-left';
  barWidth: number;       // width of sidebar/vertical bar (the wide left part)
  barHeight: number;      // height of the horizontal header/footer bar
  outerRadius: number;    // outer convex curve radius
  /** Eastward extent: svgW = barWidth + innerRadius (LCARSFrame content margin matches this). */
  innerRadius: number;
  /** Inner-corner radius at stem↔bar join; 0 = sharp miter. Default 14. */
  innerFilletRadius?: number;
  color: string;
  className?: string;
  /** Red alert: animated stroke follows the curved perimeter */
  alertOutline?: boolean;
}

export function LCARSElbow({
  position,
  barWidth,
  barHeight,
  outerRadius,
  innerRadius,
  innerFilletRadius,
  color,
  className,
  alertOutline,
}: ElbowProps) {
  const layoutExtension = innerRadius;
  const svgW = barWidth + layoutExtension;
  const or = Math.min(outerRadius, barWidth);

  const frRaw = innerFilletRadius === 0 ? 0 : (innerFilletRadius ?? DEFAULT_ADDITIVE_FILLET);
  /** Stay inside layout width (barW + fr ≤ svgW) and leave room for stem / outer radius */
  const fr = Math.max(
    0,
    Math.min(frRaw, barWidth - 1, barHeight - 1, or - 1, layoutExtension - 1, 28),
  );

  let svgH: number;
  let path: string;

  if (position === 'top-left') {
    svgH = barHeight + or;

    if (fr <= 0) {
      // Include (0,0)→(0,or) so the outer quarter-arc does not leave a curved wedge over the rail (mirrors bottom-left closure).
      path = [
        `M 0,0`,
        `L 0,${or}`,
        `A ${or},${or} 0 0,1 ${or},0`,
        `L ${svgW},0`,
        `L ${svgW},${barHeight}`,
        `L ${barWidth},${barHeight}`,
        `L ${barWidth},${svgH}`,
        `L 0,${svgH}`,
        `Z`,
      ].join(' ');
    } else {
      // Center (barW+fr, barH+fr): arc from (barW+fr, barH) on header to (barW, barH+fr) on stem — adds into void SE of (barW, barH)
      path = [
        `M 0,0`,
        `L 0,${or}`,
        `A ${or},${or} 0 0,1 ${or},0`,
        `L ${svgW},0`,
        `L ${svgW},${barHeight}`,
        `L ${barWidth + fr},${barHeight}`,
        `A ${fr},${fr} 0 0,0 ${barWidth},${barHeight + fr}`,
        `L ${barWidth},${svgH}`,
        `L 0,${svgH}`,
        `Z`,
      ].join(' ');
    }
  } else {
    svgH = barHeight + or;

    if (fr <= 0) {
      path = [
        `M 0,0`,
        `L ${barWidth},0`,
        `L ${barWidth},${or}`,
        `L ${svgW},${or}`,
        `L ${svgW},${svgH}`,
        `L ${or},${svgH}`,
        `A ${or},${or} 0 0,1 0,${svgH - or}`,
        `Z`,
      ].join(' ');
    } else {
      // Mirror of top additive join: center (barW+fr, or−fr); same sweep flag as top (0).
      path = [
        `M 0,0`,
        `L ${barWidth},0`,
        `L ${barWidth},${or - fr}`,
        `A ${fr},${fr} 0 0,0 ${barWidth + fr},${or}`,
        `L ${svgW},${or}`,
        `L ${svgW},${svgH}`,
        `L ${or},${svgH}`,
        `A ${or},${or} 0 0,1 0,${svgH - or}`,
        `Z`,
      ].join(' ');
    }
  }

  return (
    <svg
      className={className}
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      <path d={path} fill={color} />
      {alertOutline && (
        <path
          d={path}
          fill="none"
          className="lcars-elbow-stroke"
          stroke="rgba(220, 40, 40, 0.55)"
          strokeWidth={1.75}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
