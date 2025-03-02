import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Target implements IAbility {
  private static instance: Target;

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
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
target
Allows a swashbuckler to target a specific part of a victim's person
during combat.  The 'head', 'body', or 'legs'.  This skill can also be used
by a swashbuckler to use his/her environment to evade one foe and engage
another.`;

    this.manualDescription = "";
  }

  // Method to get the single instance of the class
  public static GetInstance(): Target {
    if (!Target.instance) {
      Target.instance = new Target();
    }
    return Target.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Target.GetInstance() as T;
  }
}

export default Target;
