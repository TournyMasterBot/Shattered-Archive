import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Yank implements IAbility {
  private static instance: Yank;

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
    this.helpFile = `help yank
mastery whip lash yank choke
Mastery of the Whip 
 
Few combatants are so skilled in combat with a whip as an armsman. Having  
devoted themselves to mastery of the whip, they may use the following skills:  
 
lash           Entangles an opponent's feet with a whip, causing them to
               fall hard. 
yank           Snares an opponent using two whips and allows the armsman
               to drag the opponent in a direction of their choosing.
               <yank victim direction>  
choke          Entangles an unaware victim's neck with a whip, causing them
               to pass out due to lack of air.  
 
This group is available to the following classes: ARMSMAN `;
    if (Yank.instance === undefined) {
      Yank.instance = this;
    }
  }
  // Method to get the single instance of the class
  public static GetInstance(): Yank {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Yank.GetInstance() as T;
  }
}

export default Yank;
