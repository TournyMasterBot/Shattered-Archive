import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Magic extends DamageType implements IDamageType {
  private static instance: Magic;

  constructor() {
    super({
      id: "magic",
      name: "Magic",
      type: DslDamageType.Magic,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Magic {
    if (!Magic.instance) {
      Magic.instance = new Magic();
    }
    return Magic.instance;
  }

  public Get<T>(): T {
    return Magic.GetInstance() as T;
  }
}

export default Magic;
