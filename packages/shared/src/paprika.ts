// ---------------------------------------------------------------------------
// Paprika 3 recipe types
// ---------------------------------------------------------------------------

export interface PaprikaRecipeStub {
  uid: string;
  hash: string;
}

export interface PaprikaRecipe {
  uid: string;
  name: string;
  ingredients: string;
  directions: string;
  description: string;
  notes: string;
  nutritional_info: string;
  servings: string;
  difficulty: string;
  prep_time: string;
  cook_time: string;
  total_time: string;
  source: string;
  source_url: string;
  image_url: string;
  photo: string | null;
  photo_hash: string | null;
  photo_large: string | null;
  scale: string | null;
  hash: string;
  categories: string[];
  rating: number;
  in_trash: boolean;
  is_pinned: boolean;
  on_favorites: boolean;
  on_grocery_list: boolean;
  created: string;
}

export interface PaprikaCategory {
  uid: string;
  order_flag: number;
  name: string;
  parent_uid: string | null;
}

export interface PaprikaGroceryItem {
  uid: string;
  recipe_uid: string | null;
  name: string;
  order_flag: number;
  purchased: boolean;
  aisle: string;
  ingredient: string;
  recipe: string;
  instruction: string;
  quantity: string;
  separate: boolean;
  aisle_uid: string;
  list_uid: string;
}

export interface PaprikaMeal {
  uid: string;
  recipe_uid: string | null;
  date: string;
  type: number;
  name: string;
  order_flag: number;
  type_uid: string;
  scale: string | null;
  is_ingredient: boolean;
}
