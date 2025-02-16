import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Thwack extends DamageType implements IDamageType {
  private static instance: Thwack;

  constructor() {
    super({
      id: "thwack",
      name: "Thwack",
      type: DslDamageType.Thwack,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Thwack {
    if (!Thwack.instance) {
      Thwack.instance = new Thwack();
    }
    return Thwack.instance;
  }

  public Get<T>(): T {
    return Thwack.GetInstance() as T;
  }
}

export default Thwack;
