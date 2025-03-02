import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Kick implements IAbility {
  private static instance: Kick;

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
    this.helpFile = `help Kick
KICK
Kicking allows the adventurer to receive an extra attack in combat, a powerful
kick. However, a failed kick may throw an unwary fighter off balance.  Fighters
and clerics are the most skilled at kicking, although thieves may also learn
it.`;

    if (Kick.instance === undefined) {
      Kick.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Kick {
    if (!Kick.instance) {
      Kick.instance = new Kick();
    }
    return Kick.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Kick.GetInstance() as T;
  }
}

export default Kick;
