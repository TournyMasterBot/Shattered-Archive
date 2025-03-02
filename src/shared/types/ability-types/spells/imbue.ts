import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Imbue implements IAbility {
  private static instance: Imbue;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help Imbue
IMBUE
IMBUE SPELL
Syntax:  cast imbue <target>
         cast imbue
This spell allows clerics to increase the magic-casting abilities of themselves
(when used without a target) or any other target (when used with a target).
See also:  CLERICS
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Imbue.instance === undefined) {
      Imbue.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Imbue {
    if (!Imbue.instance) {
      Imbue.instance = new Imbue();
    }
    return Imbue.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Imbue.GetInstance() as T;
  }
}

export default Imbue;
