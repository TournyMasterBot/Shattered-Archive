import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Hurl implements IAbility {
  private static instance: Hurl;

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
    this.helpFile = `help Hurl
mastery dagger stab hurl concealed attack
Mastery of the Dagger
 
Few combatants are so skilled in combat with a dagger as an armsman. Having
devoted themselves to mastery of the dagger, they may use the following skills:
 
stab             A fast piercing attack specialized to inflict damage upon
                 an enemy combatant.
hurl             An attack made with a small throwing dagger, resulting in
                 varying deleterious effects to the victim depending on the
                 blade's point of impact.
concealed attack An innate, reflexive reaction to being attacked that damages
                 the assailant in turn.
 
This group is available to the following classes: ARMSMAN`;
    if (Hurl.instance === undefined) {
      Hurl.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Hurl {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Hurl.GetInstance() as T;
  }
}

export default Hurl;
