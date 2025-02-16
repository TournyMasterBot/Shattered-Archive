import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class None extends DamageType implements IDamageType {
  private static instance: None;

  constructor() {
    super({
      id: "none",
      name: "None",
      type: DslDamageType.None,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): None {
    if (!None.instance) {
      None.instance = new None();
    }
    return None.instance;
  }

  public Get<T>(): T {
    return None.GetInstance() as T;
  }
}

export default None;
