import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import IDamageType from "@shared/types/damage-types/damage-type-interface";

export class Shock extends DamageType implements IDamageType {
  private static instance: Shock;

  constructor() {
    super({
      id: "shock",
      name: "Shock",
      type: DslDamageType.Shock,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Shock {
    if (!Shock.instance) {
      Shock.instance = new Shock();
    }
    return Shock.instance;
  }

  public Get<T>(): T {
    return Shock.GetInstance() as T;
  }
}

export default Shock;
