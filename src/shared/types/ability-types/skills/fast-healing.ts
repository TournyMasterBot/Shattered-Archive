import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class FastHealing implements IAbility {
  private static instance: FastHealing;

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
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help 'fast healing'
'FAST HEALING'
The fast healing skill improves wound healing rates, whether walking, resting,
or sleeping. It represents knowledge of healing herbs or just general
toughness and stamina.  Fast healing is checked every tick, and it is
possible for it to fail.  All class may learn this skill, but mages find it
very difficult to master, due to their bookish lifestyle.  The skill occurs 
automatically, so there is no command syntax.`;

    if (FastHealing.instance === undefined) {
      FastHealing.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FastHealing {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FastHealing.GetInstance() as T;
  }
}

export default FastHealing;
