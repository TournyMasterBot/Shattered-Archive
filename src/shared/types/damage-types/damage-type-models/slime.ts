import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import IDamageType from "@shared/types/damage-types/damage-type-interface";

export class Slime extends DamageType implements IDamageType {
  private static instance: Slime;

  constructor() {
    super({
      id: "slime",
      name: "Slime",
      type: DslDamageType.Slime,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Slime {
    if (!Slime.instance) {
      Slime.instance = new Slime();
    }
    return Slime.instance;
  }

  public Get<T>(): T {
    return Slime.GetInstance() as T;
  }
}

export default Slime;
