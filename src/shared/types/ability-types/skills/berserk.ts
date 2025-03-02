import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Berserk implements IAbility {
  private static instance: Berserk;

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
  abilityBuffCommand?: string | undefined;
  abilityBuffVariable?: string | undefined;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.abilityBuffCommand = "berserk";
    this.helpFile = `help berserk
BERSERK
Only powerful warriors can master berserking, the ability to enter insane rage
in combat.  Its effects are not altogether unlike the frenzy spell -- a huge
surge of combat prowess, coupled with a disregard for personal safety.  
Berserking warriors are more resistant to the effects of magic.`;

    if (Berserk.instance === undefined) {
      Berserk.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Berserk {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Berserk.GetInstance() as T;
  }
}

export default Berserk;
