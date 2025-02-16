import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FireBomb implements IAbility {
  private static instance: FireBomb;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Fire Bomb";
    this.helpFile = `
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FireBomb.instance === undefined) {
      FireBomb.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FireBomb {
    if (!FireBomb.instance) {
      FireBomb.instance = new FireBomb();
    }
    return FireBomb.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FireBomb.GetInstance() as T;
  }
}

export default FireBomb;
