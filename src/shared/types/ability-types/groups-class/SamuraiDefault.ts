import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Parry from "@shared/types/ability-types/skills/Parry";
import Daikyu from "@shared/types/ability-types/skills/Daikyu";
import CallDog from "@shared/types/ability-types/skills/CallDog";
import Retainer from "@shared/types/ability-types/skills/Retainer";
import Kiai from "@shared/types/ability-types/skills/Kiai";
import Bushido from "@shared/types/ability-types/skills/Bushido";
import Aikido from "@shared/types/ability-types/skills/Aikido";
import ServerCache from "@shared/cache/server-cache";

export class SamuraiDefault implements IAbilityGroup {
  static instance: SamuraiDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.SamuraiDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Parry.GetInstance(),
      Daikyu.GetInstance(),
      CallDog.GetInstance(),
      Retainer.GetInstance(),
      Kiai.GetInstance(),
      Bushido.GetInstance(),
      Aikido.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): SamuraiDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SamuraiDefault.GetInstance() as T;
  }
}

export default SamuraiDefault;
