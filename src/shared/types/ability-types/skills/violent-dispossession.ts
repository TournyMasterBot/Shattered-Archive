import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ViolentDispossession implements IAbility {
  private static instance: ViolentDispossession;

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
    this.name = "Violent Dispossession";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Allows a swashbuckler to 'cut' the purse of a victim, spilling the
victim's money.  It can also be used to cut containers spilling the contents
to the ground.`;
  }

  // Method to get the single instance of the class
  public static GetInstance(): ViolentDispossession {
    if (!ViolentDispossession.instance) {
      ViolentDispossession.instance = new ViolentDispossession();
    }
    return ViolentDispossession.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ViolentDispossession.GetInstance() as T;
  }
}

export default ViolentDispossession;
