import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import IDamageType from "@shared/types/damage-types/damage-type-interface";

export class Slap extends DamageType implements IDamageType {
  private static instance: Slap;

  constructor() {
    super({
      id: "slap",
      name: "Slap",
      type: DslDamageType.Slap,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Slap {
    if (!Slap.instance) {
      Slap.instance = new Slap();
    }
    return Slap.instance;
  }

  public Get<T>(): T {
    return Slap.GetInstance() as T;
  }
}

export default Slap;
