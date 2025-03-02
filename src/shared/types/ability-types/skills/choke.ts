import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Choke implements IAbility {
  private static instance: Choke;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help choke
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
 
This group is available to the following classes: ARMSMAN 
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.manualDescription = "";

    if (Choke.instance === undefined) {
      Choke.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Choke {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Choke.GetInstance() as T;
  }
}

export default Choke;
