import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Age from "@shared/types/ability-types/skills/Age";
import Dig from "@shared/types/ability-types/skills/Dig";
import Recall from "@shared/types/ability-types/skills/recall";
import Scrolls from "@shared/types/ability-types/skills/scrolls";
import Staves from "@shared/types/ability-types/skills/staves";
import Swim from "@shared/types/ability-types/skills/swim";
import Wands from "@shared/types/ability-types/skills/wands";
import ServerCache from "@shared/cache/server-cache";

export class RomBasics implements IAbilityGroup {
  private static instance: RomBasics;

  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.RomBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [
       Scrolls.GetInstance(), 
       Recall.GetInstance(), 
       Dig.GetInstance(), 
       Staves.GetInstance(), 
       Swim.GetInstance(), 
       Wands.GetInstance(), 
       Age.GetInstance()
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): RomBasics {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RomBasics.GetInstance() as T;
  }
}

export default RomBasics;
