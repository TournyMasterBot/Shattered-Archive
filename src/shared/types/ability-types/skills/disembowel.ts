import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Disembowel implements IAbility {
  private static instance: Disembowel;

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
    this.helpFile = `help disembowel
mastery axe shield cleave scleave whirl disembowel
Mastery of the Axe 
 
Few combatants are so skilled in combat with an axe as an armsman. Having  
devoted themselves to mastery of the axe, they may use the following skills:  
  
shield cleave   Damages an opponent's shield with a mighty blow splitting it, 
                causing the wielder of the shield to wait until repairs can 
                be made before being able to wear it again. <scleave victim> 
                
whirl           A spin move with an axe to slice the tip of the blade through 
                an opponent damaging them. 
 
disembowel      A massive gut shot to an opponent, usable when an opponent is too 
                hurt to block it. 
  
This group is available to the following classes: ARMSMAN`;
    if (Disembowel.instance === undefined) {
      Disembowel.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Disembowel {
    if (!Disembowel.instance) {
      Disembowel.instance = new Disembowel();
    }
    return Disembowel.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Disembowel.GetInstance() as T;
  }
}

export default Disembowel;
