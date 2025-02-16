import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Pierce extends DamageType implements IDamageType {
  private static instance: Pierce;

  constructor() {
    super({
      id: "pierce",
      name: "Pierce",
      type: DslDamageType.Pierce,
      resistanceCategories: [],
    });
  }

  public static GetInstance(): Pierce {
    if (!Pierce.instance) {
      Pierce.instance = new Pierce();
    }
    return Pierce.instance;
  }

  public Get<T>(): T {
    return Pierce.GetInstance() as T;
  }
}

export default Pierce;
