import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Fukiya from "@shared/types/ability-types/skills/Fukiya";
import Ninjato from "@shared/types/ability-types/skills/Ninjato";
import GroundControl from "@shared/types/ability-types/skills/GroundControl";
import Disguise from "@shared/types/ability-types/skills/Disguise";
import Pyro from "@shared/types/ability-types/skills/Pyro";
import Shuriken from "@shared/types/ability-types/skills/Shuriken";
import NightCloak from "@shared/types/ability-types/skills/NightCloak";
import ServerCache from "@shared/cache/server-cache";

export class NinjaDefault implements IAbilityGroup {
  static instance: NinjaDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.NinjaDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Fukiya.GetInstance(),
      Ninjato.GetInstance(),
      GroundControl.GetInstance(),
      Disguise.GetInstance(),
      Pyro.GetInstance(),
      Shuriken.GetInstance(),
      NightCloak.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): NinjaDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NinjaDefault.GetInstance() as T;
  }
}

export default NinjaDefault;
