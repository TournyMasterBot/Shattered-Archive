import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Illumination implements IAbility {
  private static instance: Illumination;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help Illumination
illumination
Syntax: cast 'illumination'
 
Illumination is a spell of creation that allows the caster to illuminate the
room they are in for a period of time.  Additionally, the light will, although
weaker, illuminate the surrounding rooms as well.
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Illumination.instance === undefined) {
      Illumination.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Illumination {
    if (!Illumination.instance) {
      Illumination.instance = new Illumination();
    }
    return Illumination.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Illumination.GetInstance() as T;
  }
}

export default Illumination;
