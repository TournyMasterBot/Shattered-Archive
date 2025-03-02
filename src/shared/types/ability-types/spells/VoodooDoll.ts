import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class VoodooDoll implements IAbility {
  private static instance: VoodooDoll;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `VOODOO DOLL

Syntax: c 'voodoo doll' <target>
Syntax: Dollshake
Syntax: Stabdoll

Create Voodoo Doll - By creating a personalized voodoo doll of an opponent, 
you can then use that same doll to damage or even stun your foe with either 
a vicious shake or even a more sinister stab of the voodoo doll.  Due to the 
focused concentration with voodoo magic, the doll cannot be used in the 
thick of battle.

Groups containing this skill: SHAMAN DEFAULT`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (VoodooDoll.instance === undefined) {
      VoodooDoll.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): VoodooDoll {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return VoodooDoll.GetInstance() as T;
  }
}

export default VoodooDoll;
