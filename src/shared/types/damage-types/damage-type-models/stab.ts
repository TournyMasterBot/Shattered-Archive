import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Stab extends DamageType implements IDamageType {
  private static instance: Stab;

  constructor() {
    super({
      id: "stab",
      name: "Stab",
      type: DslDamageType.Stab,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Stab {
    if (!Stab.instance) {
      Stab.instance = new Stab();
    }
    return Stab.instance;
  }

  public Get<T>(): T {
    return Stab.GetInstance() as T;
  }
}

export default Stab;
