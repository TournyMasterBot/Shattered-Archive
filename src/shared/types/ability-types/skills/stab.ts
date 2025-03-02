import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Stab implements IAbility {
  private static instance: Stab;

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
    this.helpFile = `mastery dagger stab hurl concealed attack
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
    if (Stab.instance === undefined) {
      Stab.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Stab {
    if (!Stab.instance) {
      Stab.instance = new Stab();
    }
    return Stab.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Stab.GetInstance() as T;
  }
}

export default Stab;
