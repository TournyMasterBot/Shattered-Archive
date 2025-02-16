import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Infravision implements IAbility {
  private static instance: Infravision;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Infravision";
    this.helpFile = `help 'Infravision'
INFRAVISION
INFRAVISION

Syntax: cast infravision <character>

This spell enables the target character to see warm-blooded creatures even
while in the dark, and exits of a room as well.  

See also - ENHANCEMENT`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Infravision.instance === undefined) {
      Infravision.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Infravision {
    if (!Infravision.instance) {
      Infravision.instance = new Infravision();
    }
    return Infravision.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Infravision.GetInstance() as T;
  }
}

export default Infravision;
