import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RecantBlasphemy implements IAbility {
  private static instance: RecantBlasphemy;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Recant Blasphemy";
    this.helpFile = `
        `;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (RecantBlasphemy.instance === undefined) {
      RecantBlasphemy.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RecantBlasphemy {
    if (!RecantBlasphemy.instance) {
      RecantBlasphemy.instance = new RecantBlasphemy();
    }
    return RecantBlasphemy.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RecantBlasphemy.GetInstance() as T;
  }
}

export default RecantBlasphemy;
