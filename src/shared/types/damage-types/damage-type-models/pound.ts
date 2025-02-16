import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Pound extends DamageType implements IDamageType {
  private static instance: Pound;

  constructor() {
    super({
      id: "pound",
      name: "Pound",
      type: DslDamageType.Pound,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Pound {
    if (!Pound.instance) {
      Pound.instance = new Pound();
    }
    return Pound.instance;
  }

  public Get<T>(): T {
    return Pound.GetInstance() as T;
  }
}

export default Pound;
