import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FaerieFog implements IAbility {
  private static instance: FaerieFog;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Faerie Fog";
    this.helpFile = `
help 'Faerie Fog'
'FAERIE FOG'
'FAERIE FOG'

Syntax: cast 'faerie fog'

This spell reveals all manner of invisible, hidden, and sneaking creatures
in the same room as you.

See also - WEATHER 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FaerieFog.instance === undefined) {
      FaerieFog.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FaerieFog {
    if (!FaerieFog.instance) {
      FaerieFog.instance = new FaerieFog();
    }
    return FaerieFog.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FaerieFog.GetInstance() as T;
  }
}

export default FaerieFog;
