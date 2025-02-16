import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Peck extends DamageType implements IDamageType {
  private static instance: Peck;

  constructor() {
    super({
      id: "peck",
      name: "Peck",
      type: DslDamageType.Peck,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Peck {
    if (!Peck.instance) {
      Peck.instance = new Peck();
    }
    return Peck.instance;
  }

  public Get<T>(): T {
    return Peck.GetInstance() as T;
  }
}

export default Peck;
