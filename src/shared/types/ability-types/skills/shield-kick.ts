import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class ShieldKick implements IAbility {
  private static instance: ShieldKick;

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
    this.helpFile = `help shield kick
shield kick
SHIELD KICK

Syntax: skick <target>

A martial skill requiring no small amount of skill, shield kicking is an art
passed down among barbarians and battleragers alike.  If successful, a
victim will have their shield flung away from them and their sensibilities
rattled by the jarring blow.`;

    if (ShieldKick.instance === undefined) {
      ShieldKick.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShieldKick {
    if (!ShieldKick.instance) {
      ShieldKick.instance = new ShieldKick();
    }
    return ShieldKick.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShieldKick.GetInstance() as T;
  }
}

export default ShieldKick;
