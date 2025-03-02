import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class KnowReligion implements IAbility {
  private static instance: KnowReligion;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Know Religion'
KNOW RELIGION
KNOW RELIGION

Syntax: cast 'know religion' <character>

This spell reveals the religious background of the individual it is cast
upon.

See also - BENEDICTIONS
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (KnowReligion.instance === undefined) {
      KnowReligion.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): KnowReligion {
    if (!KnowReligion.instance) {
      KnowReligion.instance = new KnowReligion();
    }
    return KnowReligion.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return KnowReligion.GetInstance() as T;
  }
}

export default KnowReligion;
