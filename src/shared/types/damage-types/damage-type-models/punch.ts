import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import IDamageType from "@shared/types/damage-types/damage-type-interface";

export class Punch extends DamageType implements IDamageType {
  private static instance: Punch;

  constructor() {
    super({
      id: "punch",
      name: "Punch",
      type: DslDamageType.Punch,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Punch {
    if (!Punch.instance) {
      Punch.instance = new Punch();
    }
    return Punch.instance;
  }

  public Get<T>(): T {
    return Punch.GetInstance() as T;
  }
}

export default Punch;
