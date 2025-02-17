import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import IDamageType from "@shared/types/damage-types/damage-type-interface";

export class Grep extends DamageType implements IDamageType {
  private static instance: Grep;

  constructor() {
    super({
      id: "grep",
      name: "Grep",
      type: DslDamageType.Grep,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Grep {
    if (!Grep.instance) {
      Grep.instance = new Grep();
    }
    return Grep.instance;
  }

  public Get<T>(): T {
    return Grep.GetInstance() as T;
  }
}

export default Grep;
