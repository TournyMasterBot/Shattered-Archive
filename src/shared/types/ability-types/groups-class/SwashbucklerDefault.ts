import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Evasion from "@shared/types/ability-types/skills/evasion";
import Mask from "@shared/types/ability-types/skills/mask";
import Target from "@shared/types/ability-types/skills/target";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Hide from "@shared/types/ability-types/skills/hide";
import Banter from "@shared/types/ability-types/skills/Banter";
import Mimic from "@shared/types/ability-types/skills/mimic";
import RetainWeapon from "@shared/types/ability-types/skills/retain-weapon";
import OceanCall from "@shared/types/ability-types/skills/ocean-call";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Boarding from "@shared/types/ability-types/skills/Boarding";
import ViolentDispossession from "@shared/types/ability-types/skills/violent-dispossession";
import Rescue from "@shared/types/ability-types/skills/rescue";
import Disarm from "@shared/types/ability-types/skills/Disarm";
import Dropkick from "@shared/types/ability-types/skills/dropkick";
import ServerCache from "@shared/cache/server-cache";

export class SwashbucklerDefault implements IAbilityGroup {
  static instance: SwashbucklerDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.SwashbucklerDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      Evasion.GetInstance(),
      Mask.GetInstance(),
      Target.GetInstance(),
      SecondAttack.GetInstance(),
      Hide.GetInstance(),
      Banter.GetInstance(),
      Mimic.GetInstance(),
      RetainWeapon.GetInstance(),
      OceanCall.GetInstance(),
      ThirdAttack.GetInstance(),
      Sneak.GetInstance(),
      Boarding.GetInstance(),
      ViolentDispossession.GetInstance(),
      Rescue.GetInstance(),
      Disarm.GetInstance(),
      Dropkick.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): SwashbucklerDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SwashbucklerDefault.GetInstance() as T;
  }
}

export default SwashbucklerDefault;
