import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Sneak implements IAbility {
  private static instance: Sneak;

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
    this.helpFile = `HIDE SNEAK
Hide and sneak are similar skills, both related to remaining undetected.
Hide has a very high chance of success, but only works for as long as the
character remains stationary.  Hide will not show up in your affects (which
only shows spell affects, not skills), and if you were successfully hidden
the act of checking your affects will reveal your presence to others.
Sneak may be used when moving (including to sneak by monsters), but has a
lower chance of success.  Warriors, thieves, druids, paladins, assassins,
barbarians may learn these skills.`;

    if (Sneak.instance === undefined) {
      Sneak.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Sneak {
    if (!Sneak.instance) {
      Sneak.instance = new Sneak();
    }
    return Sneak.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Sneak.GetInstance() as T;
  }
}

export default Sneak;
