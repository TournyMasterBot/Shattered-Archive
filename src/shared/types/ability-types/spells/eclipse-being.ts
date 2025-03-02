import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EclipseBeing implements IAbility {
  private static instance: EclipseBeing;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (EclipseBeing.instance === undefined) {
      EclipseBeing.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EclipseBeing {
    if (!EclipseBeing.instance) {
      EclipseBeing.instance = new EclipseBeing();
    }
    return EclipseBeing.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EclipseBeing.GetInstance() as T;
  }
}

export default EclipseBeing;
