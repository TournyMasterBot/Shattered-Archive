import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Attack from "../groups-spells/attack";
import Healing from "../groups-spells/healing";
import Nature from "../groups-spells/nature";
import Protective from "../groups-spells/protective";
import Weather from "../groups-spells/weather";
import AcuteVision from "@shared/types/ability-types/skills/acute-vision";
import Creaturelore from "@shared/types/ability-types/skills/creaturelore";
import DarkVision from "@shared/types/ability-types/skills/dark-vision";
import Dodge from "@shared/types/ability-types/skills/dodge";
import FindWater from "@shared/types/ability-types/skills/find-water";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Tame from "@shared/types/ability-types/skills/tame";

export class DruidDefault implements IAbilityGroup {
  private static instance: DruidDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.DruidDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Nature.GetInstance().Get<Nature>().abilities,
      ...Healing.GetInstance().Get<Healing>().abilities,
      ...Weather.GetInstance().Get<Weather>().abilities,
      ...Attack.GetInstance().Get<Attack>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      FindWater.GetInstance(),
      Sneak.GetInstance(),
      Dodge.GetInstance(),
      DarkVision.GetInstance(),
      Tame.GetInstance(),
      AcuteVision.GetInstance(),
      Creaturelore.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): DruidDefault {
    if (!DruidDefault.instance) {
      DruidDefault.instance = new DruidDefault();
    }
    return DruidDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DruidDefault.GetInstance() as T;
  }
}

export default DruidDefault;
