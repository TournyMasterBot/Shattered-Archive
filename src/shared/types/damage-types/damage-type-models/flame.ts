import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Flame extends DamageType implements IDamageType {
  private static instance: Flame;

  constructor() {
    super({
      id: "flame",
      name: "Flame",
      type: DslDamageType.Flame,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Flame {
    if (!Flame.instance) {
      Flame.instance = new Flame();
    }
    return Flame.instance;
  }

  public Get<T>(): T {
    return Flame.GetInstance() as T;
  }
}

export default Flame;
