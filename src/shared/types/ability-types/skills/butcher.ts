import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Butcher implements IAbility {
  private static instance: Butcher;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
BUTCHER
BUTCHER
Syntax: butcher corpse
Butcher is a skill known only to rangers, barbarians and shamans. 
Butchering a corpse will turn the corpse into a number of edible steaks. If
there is more than one corpse in a room, you can use the second syntax
(replacing "n" with a number) to specify which corpse is to be butchered. 
Corpses must be empty of all equipment before they can be butchered.  
see also: 'RANGER' 'BARBARIAN' 'SHAMAN'
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (Butcher.instance === undefined) {
      Butcher.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Butcher {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Butcher.GetInstance() as T;
  }
}

export default Butcher;
