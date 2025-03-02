import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class WizardMark implements IAbility {
  private static instance: WizardMark;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `'WIZARD MARK'
WIZARD MARK

Syntax: cast 'wizard mark' <object>

This spell scribes the mark of the caster into the targeted object. To
determine whether some object in your inventory has been marked, one must
cast the spell of identification upon the object.

See also - ALTERATION TRANSMUTER`;
    this.abilityGroupType = AbilityGroupType.Unknown; // Adjust if necessary
    this.abilityUsage = AbilityUsage.Active;

    if (WizardMark.instance === undefined) {
      WizardMark.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): WizardMark {
    if (!WizardMark.instance) {
      WizardMark.instance = new WizardMark();
    }
    return WizardMark.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WizardMark.GetInstance() as T;
  }
}

export default WizardMark;
