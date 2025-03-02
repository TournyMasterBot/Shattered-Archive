import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Excommunicate implements IAbility {
  private static instance: Excommunicate;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Excommunicate'
'EXCOMMUNICATE'

Syntax: cast 'excommunicate' <target>

This spell removes an individual from the favor of their deity, stripping
them of blessings and protections granted by divine power.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Excommunicate.instance === undefined) {
      Excommunicate.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Excommunicate {
    if (!Excommunicate.instance) {
      Excommunicate.instance = new Excommunicate();
    }
    return Excommunicate.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Excommunicate.GetInstance() as T;
  }
}

export default Excommunicate;
