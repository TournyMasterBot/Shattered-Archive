import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Charge extends DamageType implements IDamageType {
  private static instance: Charge;

  constructor() {
    super({
      id: "charge",
      name: "Charge",
      type: DslDamageType.Charge,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Charge {
    if (!Charge.instance) {
      Charge.instance = new Charge();
    }
    return Charge.instance;
  }

  public Get<T>(): T {
    return Charge.GetInstance() as T;
  }
}

export default Charge;
