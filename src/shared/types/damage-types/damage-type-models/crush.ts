import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Crush extends DamageType implements IDamageType {
  private static instance: Crush;

  constructor() {
    super({
      id: "crush",
      name: "Crush",
      type: DslDamageType.Crush,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Crush {
    if (!Crush.instance) {
      Crush.instance = new Crush();
    }
    return Crush.instance;
  }

  public Get<T>(): T {
    return Crush.GetInstance() as T;
  }
}

export default Crush;
