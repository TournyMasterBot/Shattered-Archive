import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Sting extends DamageType implements IDamageType {
  private static instance: Sting;

  constructor() {
    super({
      id: "sting",
      name: "Sting",
      type: DslDamageType.Sting,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Sting {
    if (!Sting.instance) {
      Sting.instance = new Sting();
    }
    return Sting.instance;
  }

  public Get<T>(): T {
    return Sting.GetInstance() as T;
  }
}

export default Sting;
