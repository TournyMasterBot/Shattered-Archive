import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class AcidicBite extends DamageType implements IDamageType {
  private static instance: AcidicBite;

  constructor() {
    super({
      id: "acBite",
      name: "Acidic Bite",
      type: DslDamageType.AcidicBite,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): AcidicBite {
    if (!AcidicBite.instance) {
      AcidicBite.instance = new AcidicBite();
    }
    return AcidicBite.instance;
  }

  public Get<T>(): T {
    return AcidicBite.GetInstance() as T;
  }
}

export default AcidicBite;
