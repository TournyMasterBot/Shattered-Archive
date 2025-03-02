import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Entwine implements IAbility {
  private static instance: Entwine;

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
    this.helpFile = `help entwine
mastery flail entwine sting strip
Mastery of the Flail
 
None upon the battlefield wield a flail with such deadly acumen as an armsman.
Their specialization in flails yields the following abilities:
 
entwine         A difficult attack utilizing two flails that prevents the
                victim from fleeing.
sting           A vicious lashing attack upon an opponent, resulting in
                an ensuing weakness.
strip           Owing to innate skill with a flail, an armsman may have a
                chance of disarming their opponent in combat.
 
This group is available to the following classes: ARMSMAN`;
    if (Entwine.instance === undefined) {
      Entwine.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Entwine {
    if (!Entwine.instance) {
      Entwine.instance = new Entwine();
    }
    return Entwine.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Entwine.GetInstance() as T;
  }
}

export default Entwine;
