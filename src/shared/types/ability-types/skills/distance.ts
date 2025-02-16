import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Distance implements IAbility {
  private static instance: Distance;

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
    this.name = "Distance";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help distance
mastery polearm distance entrap chargeset
Mastery of the Polearm 
 
Few combatants are so skilled in combat with a polearm as an armsman. Having  
devoted themselves to mastery of the polearm, they may use the following skills:  
 
distance       An instinctive method of keeping distance between the armsman 
               and their opponent while using polearms. 
entrap         The use of a polearm to entrap and disarm an opponents weapon, 
               unless it is too small like a dagger. 
chargeset       An instinctive reaction when you are attacked to swing your polearm 
               just right to let the person attacking you use their own momentum  
               to run upon your polearm. 
 
This group is available to the following classes: ARMSMAN`;
    if (Distance.instance === undefined) {
      Distance.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Distance {
    if (!Distance.instance) {
      Distance.instance = new Distance();
    }
    return Distance.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Distance.GetInstance() as T;
  }
}

export default Distance;
