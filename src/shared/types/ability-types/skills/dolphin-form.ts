import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class DolphinForm implements IAbility {
  private static instance: DolphinForm;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Dolphin Form";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help dolphinform
DOLPHIN FORM
Turn into a dolphin.`;

    this.manualDescription = "Turn into a dolphin";

    if (DolphinForm.instance === undefined) {
      DolphinForm.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DolphinForm {
    if (!DolphinForm.instance) {
      DolphinForm.instance = new DolphinForm();
    }
    return DolphinForm.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DolphinForm.GetInstance() as T;
  }
}

export default DolphinForm;
