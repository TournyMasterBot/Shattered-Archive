import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FaerieFlames implements IAbility {
  private static instance: FaerieFlames;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `'FAERIE FLAMES'
FAERIE FLAMES

Syntax: cast 'faerie flames'

Faerie flames is a priest spell that is a combination of faerie fire and
faerie fog.  A priest can create a fog which seeks to draw out those hiding
and then surround them by a glowing outline.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FaerieFlames.instance === undefined) {
      FaerieFlames.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FaerieFlames {
    if (!FaerieFlames.instance) {
      FaerieFlames.instance = new FaerieFlames();
    }
    return FaerieFlames.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FaerieFlames.GetInstance() as T;
  }
}

export default FaerieFlames;
