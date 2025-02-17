import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import { DslDamageCategoryType } from "@shared/types/damage-types/damage-category-type";

export class Drain extends DamageType implements IDamageType {
  private static instance: Drain;

  constructor() {
    super({
      id: "drain",
      name: "Drain",
      type: DslDamageType.Drain,
      damageCategoryType: DslDamageCategoryType.Negative,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Drain {
    if (!Drain.instance) {
      Drain.instance = new Drain();
    }
    return Drain.instance;
  }

  public Get<T>(): T {
    return Drain.GetInstance() as T;
  }
}

export default Drain;
