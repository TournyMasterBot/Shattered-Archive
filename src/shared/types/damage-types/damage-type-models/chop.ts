import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Chop extends DamageType implements IDamageType {
  private static instance: Chop;

  constructor() {
    super({
      id: "chop",
      name: "Chop",
      type: DslDamageType.Chop,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Chop {
    if (!Chop.instance) {
      Chop.instance = new Chop();
    }
    return Chop.instance;
  }

  public Get<T>(): T {
    return Chop.GetInstance() as T;
  }
}

export default Chop;
